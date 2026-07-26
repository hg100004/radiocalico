import sqlite3, os
from flask import Flask, jsonify, request, send_from_directory

app = Flask(__name__)
DB  = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ratings.db')
DIR = os.path.dirname(os.path.abspath(__file__))

def get_db():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    return c

def init_db():
    with get_db() as c:
        c.execute('''CREATE TABLE IF NOT EXISTS votes (
            song_key   TEXT NOT NULL,
            user_id    TEXT NOT NULL,
            vote       TEXT NOT NULL CHECK(vote IN ('up','down')),
            created_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (song_key, user_id)
        )''')

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

@app.route('/api/ratings')
def get_ratings():
    s   = request.args.get('s', '')
    uid = request.args.get('uid', '')
    if not s:
        return jsonify(error='missing song key'), 400
    with get_db() as c:
        row = c.execute(
            "SELECT SUM(vote='up') up, SUM(vote='down') down FROM votes WHERE song_key=?", (s,)
        ).fetchone()
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
    with get_db() as c:
        existing = c.execute(
            "SELECT vote FROM votes WHERE song_key=? AND user_id=?", (s, uid)
        ).fetchone()
        if existing:
            row = c.execute(
                "SELECT SUM(vote='up') up, SUM(vote='down') down FROM votes WHERE song_key=?", (s,)
            ).fetchone()
            return jsonify(up=row['up'] or 0, down=row['down'] or 0,
                           user_vote=existing['vote']), 409
        c.execute("INSERT INTO votes (song_key, user_id, vote) VALUES (?,?,?)", (s, uid, vote))
        row = c.execute(
            "SELECT SUM(vote='up') up, SUM(vote='down') down FROM votes WHERE song_key=?", (s,)
        ).fetchone()
    return jsonify(up=row['up'] or 0, down=row['down'] or 0, user_vote=vote)

if __name__ == '__main__':
    init_db()
    app.run(debug=True, port=5000)
