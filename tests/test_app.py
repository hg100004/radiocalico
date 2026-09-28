import os
import sys
import threading

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

import app as rc_app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(rc_app, 'DB', str(tmp_path / 'ratings.db'))
    rc_app.init_db()
    rc_app.app.config['TESTING'] = True
    with rc_app.app.test_client() as c:
        yield c


def vote(client, s, uid, v):
    return client.post('/api/vote', json={'s': s, 'uid': uid, 'vote': v})


def ratings(client, s, uid=''):
    return client.get(f'/api/ratings?s={s}&uid={uid}')


def test_health_returns_ok_when_db_reachable(client):
    r = client.get('/health')
    assert r.status_code == 200
    assert r.get_json() == {'status': 'ok'}


def test_health_returns_503_when_db_unreachable(client, monkeypatch):
    monkeypatch.setattr(rc_app, 'DB', '/nonexistent-dir/ratings.db')
    r = client.get('/health')
    assert r.status_code == 503
    assert r.get_json()['status'] == 'error'


def test_ratings_missing_song_key_is_400(client):
    r = client.get('/api/ratings')
    assert r.status_code == 400
    assert r.get_json()['error'] == 'missing song key'


def test_ratings_defaults_to_zero_for_unknown_song(client):
    r = ratings(client, 'song-a', 'user-a')
    assert r.status_code == 200
    assert r.get_json() == {'up': 0, 'down': 0, 'user_vote': None}


def test_vote_records_and_returns_updated_counts(client):
    r = vote(client, 'song-a', 'user-a', 'up')
    assert r.status_code == 200
    assert r.get_json() == {'up': 1, 'down': 0, 'user_vote': 'up'}

    r = ratings(client, 'song-a', 'user-a')
    assert r.get_json() == {'up': 1, 'down': 0, 'user_vote': 'up'}


def test_vote_from_second_user_accumulates(client):
    vote(client, 'song-a', 'user-a', 'up')
    r = vote(client, 'song-a', 'user-b', 'down')
    assert r.get_json() == {'up': 1, 'down': 1, 'user_vote': 'down'}


def test_duplicate_vote_is_409_and_keeps_original(client):
    vote(client, 'song-a', 'user-a', 'up')
    r = vote(client, 'song-a', 'user-a', 'down')
    assert r.status_code == 409
    assert r.get_json() == {'up': 1, 'down': 0, 'user_vote': 'up'}

    r = ratings(client, 'song-a', 'user-a')
    assert r.get_json()['user_vote'] == 'up'
    assert r.get_json()['down'] == 0


@pytest.mark.parametrize('payload', [
    {'s': '', 'uid': 'user-a', 'vote': 'up'},
    {'s': 'song-a', 'uid': '', 'vote': 'up'},
    {'s': 'song-a', 'uid': 'user-a', 'vote': 'sideways'},
])
def test_vote_rejects_invalid_payloads(client, payload):
    r = client.post('/api/vote', json=payload)
    assert r.status_code == 400
    assert r.get_json()['error'] == 'invalid'


def test_vote_options_preflight_returns_204(client):
    r = client.options('/api/vote')
    assert r.status_code == 204


def test_votes_are_isolated_per_song(client):
    vote(client, 'song-a', 'user-a', 'up')
    r = ratings(client, 'song-b', 'user-a')
    assert r.get_json() == {'up': 0, 'down': 0, 'user_vote': None}


def test_cors_headers_present(client):
    r = ratings(client, 'song-a', 'user-a')
    assert r.headers['Access-Control-Allow-Origin'] == '*'


def test_concurrent_duplicate_votes_only_one_succeeds(client):
    # Each thread needs its own test client -- Flask's test client keeps
    # per-instance context-stack state that isn't safe to share across threads.
    n = 8
    results = []
    barrier = threading.Barrier(n)

    def cast():
        barrier.wait()
        with rc_app.app.test_client() as c:
            results.append(vote(c, 'song-race', 'user-race', 'up').status_code)

    threads = [threading.Thread(target=cast) for _ in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert sorted(results) == [200] + [409] * (n - 1)

    r = ratings(client, 'song-race', 'user-race')
    assert r.get_json() == {'up': 1, 'down': 0, 'user_vote': 'up'}
