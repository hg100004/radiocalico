import os
import sys
import threading
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

TEST_DATABASE_URL = os.environ.get(
    'TEST_DATABASE_URL',
    'postgresql://radiocalico:radiocalico@localhost:5432/radiocalico',
)

psycopg2 = pytest.importorskip('psycopg2')

try:
    _probe = psycopg2.connect(TEST_DATABASE_URL)
    _probe.close()
except Exception as exc:
    pytest.skip(f'PostgreSQL not reachable at {TEST_DATABASE_URL}: {exc}', allow_module_level=True)

import app as rc_app


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(rc_app, 'IS_POSTGRES', True)
    monkeypatch.setattr(rc_app, 'DATABASE_URL', TEST_DATABASE_URL)
    rc_app.init_db()
    rc_app.app.config['TESTING'] = True

    song_key = f'pg-test-{uuid.uuid4()}'
    with rc_app.app.test_client() as c:
        yield c, song_key

    with rc_app.get_db() as conn:
        conn.execute("DELETE FROM votes WHERE song_key=?", (song_key,))


def vote(client, s, uid, v):
    return client.post('/api/vote', json={'s': s, 'uid': uid, 'vote': v})


def ratings(client, s, uid=''):
    return client.get(f'/api/ratings?s={s}&uid={uid}')


def test_health_returns_ok_when_db_reachable(client):
    c, _ = client
    r = c.get('/health')
    assert r.status_code == 200
    assert r.get_json() == {'status': 'ok'}


def test_ratings_defaults_to_zero_for_unknown_song(client):
    c, song_key = client
    r = ratings(c, song_key, 'user-a')
    assert r.status_code == 200
    assert r.get_json() == {'up': 0, 'down': 0, 'user_vote': None}


def test_vote_records_and_returns_updated_counts(client):
    c, song_key = client
    r = vote(c, song_key, 'user-a', 'up')
    assert r.status_code == 200
    assert r.get_json() == {'up': 1, 'down': 0, 'user_vote': 'up'}

    r = ratings(c, song_key, 'user-a')
    assert r.get_json() == {'up': 1, 'down': 0, 'user_vote': 'up'}


def test_vote_from_second_user_accumulates(client):
    c, song_key = client
    vote(c, song_key, 'user-a', 'up')
    r = vote(c, song_key, 'user-b', 'down')
    assert r.get_json() == {'up': 1, 'down': 1, 'user_vote': 'down'}


def test_duplicate_vote_is_409_and_keeps_original(client):
    c, song_key = client
    vote(c, song_key, 'user-a', 'up')
    r = vote(c, song_key, 'user-a', 'down')
    assert r.status_code == 409
    assert r.get_json() == {'up': 1, 'down': 0, 'user_vote': 'up'}


def test_concurrent_duplicate_votes_only_one_succeeds(client):
    # Proves the INSERT ... ON CONFLICT DO NOTHING path is actually atomic
    # under real concurrent connections, not just single-threaded reasoning.
    _, song_key = client
    n = 8
    results = []
    barrier = threading.Barrier(n)

    def cast():
        barrier.wait()
        with rc_app.app.test_client() as c:
            results.append(vote(c, song_key, 'user-race', 'up').status_code)

    threads = [threading.Thread(target=cast) for _ in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert sorted(results) == [200] + [409] * (n - 1)

    r = ratings(rc_app.app.test_client(), song_key, 'user-race')
    assert r.get_json() == {'up': 1, 'down': 0, 'user_vote': 'up'}
