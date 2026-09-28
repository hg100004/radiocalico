import sqlite3, os
from contextlib import contextmanager
from flask import Flask, jsonify, request, send_from_directory

app = Flask(__name__)
DB  = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ratings.db')
DIR = os.path.dirname(os.path.abspath(__file__))

# DATABASE_URL selects the backend: unset -> SQLite (DB path above, for local
# dev/tests); postgres://... or postgresql://... -> PostgreSQL, for production.
DATABASE_URL = os.environ.get('DATABASE_URL', '')
IS_POSTGRES  = DATABASE_URL.startswith(('postgres://', 'postgresql://'))

class PgConnection:
    """Adapts a psycopg2 connection to sqlite3.Connection's execute()-on-connection API."""
    def __init__(self, conn):
        self._conn = conn

    def execute(self, query, params=()):
        cur = self._conn.cursor()
        cur.execute(query.replace('?', '%s'), params)
        return cur

    def commit(self):  self._conn.commit()
    def rollback(self): self._conn.rollback()
    def close(self):   self._conn.close()

@contextmanager
def get_db():
    if IS_POSTGRES:
        import psycopg2, psycopg2.extras
        conn = PgConnection(psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor))
    else:
        conn = sqlite3.connect(DB)
        conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def init_db():
    ts_type    = 'TIMESTAMP' if IS_POSTGRES else 'TEXT'
    ts_default = 'CURRENT_TIMESTAMP' if IS_POSTGRES else "(datetime('now'))"
    with get_db() as c:
        c.execute(f'''CREATE TABLE IF NOT EXISTS votes (
            song_key   TEXT NOT NULL,
            user_id    TEXT NOT NULL,
            vote       TEXT NOT NULL CHECK(vote IN ('up','down')),
            created_at {ts_type} DEFAULT {ts_default},
            PRIMARY KEY (song_key, user_id)
        )''')

VOTE_COUNTS_SQL = '''SELECT
    SUM(CASE WHEN vote='up'   THEN 1 ELSE 0 END) up,
    SUM(CASE WHEN vote='down' THEN 1 ELSE 0 END) down
    FROM votes WHERE song_key=?'''

@app.after_request
def add_cors(r):
    r.headers['Access-Control-Allow-Origin']  = '*'
    r.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    r.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return r

@app.route('/')
def index():
    return send_from_directory(DIR, 'index.html')

@app.route('/<path:filename>')
def static_files(filename):
    allowed = {'.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.css', '.js'}
    ext = os.path.splitext(filename)[1].lower()
    if ext not in allowed:
        return '', 404
    return send_from_directory(DIR, filename)

@app.route('/health')
def health():
    try:
        with get_db() as c:
            c.execute('SELECT 1')
        return jsonify(status='ok'), 200
    except Exception as e:
        return jsonify(status='error', error=str(e)), 503

@app.route('/api/ratings')
def get_ratings():
    s   = request.args.get('s', '')
    uid = request.args.get('uid', '')
    if not s:
        return jsonify(error='missing song key'), 400
    with get_db() as c:
        row = c.execute(VOTE_COUNTS_SQL, (s,)).fetchone()
        vrow = c.execute(
            "SELECT vote FROM votes WHERE song_key=? AND user_id=?", (s, uid)
        ).fetchone()
    return jsonify(up=row['up'] or 0, down=row['down'] or 0,
                   user_vote=vrow['vote'] if vrow else None)

@app.route('/api/vote', methods=['POST', 'OPTIONS'])
def submit_vote():
    if request.method == 'OPTIONS':
        return '', 204
    d    = request.get_json(force=True)
    s    = d.get('s', '').strip()
    uid  = d.get('uid', '').strip()
    vote = d.get('vote', '').strip()
    if not s or not uid or vote not in ('up', 'down'):
        return jsonify(error='invalid'), 400

    # Atomic insert-if-absent: avoids a check-then-insert race between concurrent
    # requests for the same (song_key, user_id) under multiple gunicorn workers.
    insert_sql = (
        "INSERT INTO votes (song_key, user_id, vote) VALUES (?,?,?) "
        "ON CONFLICT (song_key, user_id) DO NOTHING"
        if IS_POSTGRES else
        "INSERT OR IGNORE INTO votes (song_key, user_id, vote) VALUES (?,?,?)"
    )
    with get_db() as c:
        inserted = c.execute(insert_sql, (s, uid, vote)).rowcount == 1
        if not inserted:
            existing = c.execute(
                "SELECT vote FROM votes WHERE song_key=? AND user_id=?", (s, uid)
            ).fetchone()
            row = c.execute(VOTE_COUNTS_SQL, (s,)).fetchone()
            return jsonify(up=row['up'] or 0, down=row['down'] or 0,
                           user_vote=existing['vote']), 409
        row = c.execute(VOTE_COUNTS_SQL, (s,)).fetchone()
    return jsonify(up=row['up'] or 0, down=row['down'] or 0, user_vote=vote)

if __name__ == '__main__':
    init_db()
    app.run(debug=True, port=5000)
