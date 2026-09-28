FROM nginx:alpine

COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# Only the whitelisted static assets are copied in -- not the whole repo
# (no app.py, ratings.db, tests/, .git, etc. anywhere near the web root).
COPY index.html style.css script.js logic.js RadioCalicoLogoTM.png /usr/share/nginx/html/
