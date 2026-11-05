"""Reference backend using the Python standard library only. Not a production WSGI server.

Every route renders a full HTML page; when the request carries X-Fragment-Target the matching region
is returned alone (optional optimisation). DEMO ONLY: in-memory sessions, no authentication, no database.
Contract: ../../docs/CONTRACT-AR.md
"""
import html
import json
import os
import re
import secrets
import time
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlencode, urlsplit, unquote

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "public"
PROJECTS = json.loads((ROOT / "projects.json").read_text(encoding="utf-8"))
LAYOUT = (PUBLIC / "index.html").read_text(encoding="utf-8")
SESSIONS = {}  # Demo only: substitute proper auth and durable session storage.
TEST_ROUTES = os.getenv("KIT_TEST_ROUTES") == "1"  # failure scenarios for the test suite only
CSP = ("default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; "
       "base-uri 'none'; form-action 'self'; frame-src 'none'; frame-ancestors 'none'")
HEADERS = {
    "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": CSP, "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "DENY", "Cache-Control": "no-store",
    "Vary": "X-Fragment-Target",
}
REGION = re.compile(r"^[A-Za-z][\w-]{0,63}$")
# Regions served alone on X-Fragment-Target. Only self-contained ones qualify: everything else depends on page
# state (selection, query), so the full page is returned and the layer refreshes all dynamic regions from it.
FRAGMENTS = {"project-tab"}
esc = lambda value: html.escape(str(value if value is not None else ""), quote=True)
pick = lambda ident: next((p for p in PROJECTS if p["id"] == ident), None)


def query(**params):
    items = {k: v for k, v in params.items() if v}
    return "?" + urlencode(items) if items else ""


def project_href(ident, q="", view=""):
    return "/projects/" + quote(ident, safe="") + query(q=q, view=view)


# ---- views: every region has a stable id; the same functions feed full pages and fragments ----
def search_form(action, q):
    """The search form lives inside the list region so action, value and hidden state travel with every swap."""
    return ('<form action="' + esc(action) + '" method="get" data-target="#project-list" class="ds-search">'
            + '<label for="project-search">البحث في المشاريع</label><div class="ds-input-row">'
            + '<input id="project-search" name="q" type="search" value="' + esc(q) + '" placeholder="اسم المشروع" autocomplete="off">'
            + '<button class="ds-button ds-button-quiet" type="submit">بحث</button></div></form>')


def list_view(q="", selected=None, view="overview", action="/projects"):
    needle = q.strip().casefold()
    entries = [p for p in PROJECTS if needle in p["title"].casefold()]
    items = "".join(
        '<li><a href="' + esc(project_href(p["id"], q)) + '" data-target="#project-panel"'
        + (' aria-current="page"' if p["id"] == selected else "") + ">" + esc(p["title"]) + "</a><small>"
        + esc(p["status"]) + "</small></li>" for p in entries)
    body = '<ul class="ds-project-list">' + items + "</ul>" if entries else '<p class="ds-empty">لا توجد مشاريع مطابقة.</p>'
    return '<section id="project-list" aria-label="نتائج البحث">' + search_form(action, q) + '<h2>قائمة المشاريع</h2>' + body + "</section>"


def tab_view(project, view="overview", q=""):
    """Self-contained region: the tab nav lives inside it so aria-current stays right when it is swapped alone."""
    def link(v, label):
        return ('<a href="' + esc(project_href(project["id"], q, v)) + '" data-target="#project-tab"'
                + (' aria-current="true"' if view == v else "") + ">" + label + "</a>")
    if view == "tasks":
        body = "<h3>المهام الأساسية</h3><ul>" + "".join("<li>" + esc(t) + "</li>" for t in project["tasks"]) + "</ul>"
    else:
        body = '<h3>ملخص المشروع</h3><p class="ds-muted">مثال يوضح استبدال أجزاء HTML من الخادم دون JavaScript لتوليد الواجهة.</p>'
    return ('<div id="project-tab"><nav class="ds-tabs" aria-label="أقسام المشروع">' + link("overview", "نظرة عامة") + link("tasks", "المهام")
            + '</nav><div class="ds-panel">' + body + "</div></div>")


def panel_view(project, session, q="", view="overview", note=None, error="", saved=False):
    text = note if note is not None else session["notes"].get(project["id"], project["note"])
    if error:
        notice = '<div class="ds-alert ds-alert-error" role="alert" id="note-error">' + esc(error) + "</div>"
    elif saved:
        notice = '<div class="ds-alert ds-alert-success">تم حفظ الملاحظة بنجاح.</div>'
    else:
        notice = ""

    return ('<section id="project-panel" class="ds-card">'
            + '<div class="ds-detail-title"><h2>' + esc(project["title"]) + '</h2><span class="ds-pill">' + esc(project["status"]) + "</span></div>"
            + '<div class="ds-section">' + tab_view(project, view, q) + "</div>"
            + '<section class="ds-section" aria-label="ملاحظات المشروع"><h3>الملاحظات</h3>' + notice
            + '<form action="' + esc("/projects/" + quote(project["id"], safe="") + "/notes") + '" method="post" data-target="#project-panel" class="ds-note-form">'
            + '<input type="hidden" name="csrf" value="' + esc(session["csrf"]) + '">'
            + ('<input type="hidden" name="q" value="' + esc(q) + '">' if q else "")
            + '<label for="note">وصف مختصر</label><textarea id="note" name="note" maxlength="300" rows="4" required'
            + (' aria-invalid="true" aria-describedby="note-error" autofocus' if error else "") + ">" + esc(text) + "</textarea>"
            + '<button class="ds-button" type="submit">حفظ الملاحظة</button></form></section></section>')


def empty_panel():
    return '<section id="project-panel" class="ds-card"><h2>اختر مشروعًا</h2><p class="ds-muted">اختر مشروعًا من القائمة لعرض تفاصيله وملاحظاته.</p></section>'


def message_panel(title, message):
    return ('<section id="project-panel" class="ds-card"><h2>' + esc(title) + '</h2><p class="ds-alert ds-alert-error" role="alert">'
            + esc(message) + '</p><a href="/">العودة إلى قائمة المشاريع</a></section>')


class Handler(BaseHTTPRequestHandler):
    timeout = 15  # slow-loris guard on the socket

    def log_message(self, fmt, *args):
        print("http:", fmt % args, flush=True)

    # ---- plumbing ----
    def output(self, status, data, extra=None, cookie=None):
        self.send_response(status)
        merged = dict(HEADERS)
        merged.update(extra or {})
        for k, v in merged.items():
            self.send_header(k, v)
        if cookie:
            self.send_header("Set-Cookie", "kit_sid=" + cookie + "; HttpOnly; SameSite=Lax; Path=/"
                             + ("; Secure" if os.getenv("PUBLIC_ORIGIN", "").startswith("https://") else ""))
        data = data.encode("utf-8") if isinstance(data, str) else data
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def render(self, status, title, q="", view="overview", selected=None, search_action="/projects", list_html=None, panel="", tab=None, extra=None):
        regions = {"project-list": list_html if list_html is not None else list_view(q, selected, view, search_action), "project-panel": panel}
        if tab:
            regions["project-tab"] = tab
        wanted = self.headers.get("X-Fragment-Target")
        if wanted and REGION.match(wanted) and wanted in FRAGMENTS and wanted in regions:
            body = "<title>" + esc(title) + " | HTMZ Kit</title>" + regions[wanted]
        else:
            body = LAYOUT.replace("{{TITLE}}", esc(title)).replace("{{PROJECT_LIST}}", regions["project-list"]).replace("{{PROJECT_PANEL}}", panel)
        self.output(status, body, extra, cookie=getattr(self, "_new_cookie", None))

    def error_page(self, status, title, message, q=""):
        self.render(status, title, q=q, panel=message_panel(title, message))

    def session(self, create=False):
        try:
            jar = SimpleCookie()
            jar.load(self.headers.get("Cookie", ""))
            sid = jar["kit_sid"].value if "kit_sid" in jar else None
        except Exception:
            sid = None
        if sid in SESSIONS:
            return SESSIONS[sid]
        if not create:
            return None
        sid = secrets.token_hex(24)
        SESSIONS[sid] = {"csrf": secrets.token_hex(24), "notes": {}, "hits": 0}
        self._new_cookie = sid
        return SESSIONS[sid]

    # ---- test-only failure scenarios ----
    def test_routes(self, url, session):
        name = url.path[len("/__test/"):]
        qs = parse_qs(url.query)
        val = lambda key, default="": qs.get(key, [default])[0]
        marker = lambda label: '<section id="project-panel" class="ds-card"><h2>' + esc(label) + "</h2><p>استجابة اختبار.</p></section>"
        if name == "slow":
            try:
                ms = min(int(val("ms", "1000")), 20000)
            except ValueError:
                ms = 1000
            time.sleep(ms / 1000)
            return self.render(200, "slow", panel=marker(val("label", "slow")))
        if name == "hang":
            time.sleep(25)  # never answers within the client timeout
            return
        if name == "error500":
            return self.output(500, '<!doctype html><html lang="ar" dir="rtl"><head><title>خطأ</title></head><body><h1>500</h1></body></html>')
        if name == "error400":
            return self.output(400, '<!doctype html><html lang="ar" dir="rtl"><head><title>خطأ</title></head><body><h1>400</h1></body></html>')
        if name == "flaky":
            session["hits"] += 1
            if session["hits"] % 2:
                return self.output(500, "<!doctype html><title>500</title><h1>500</h1>")
            return self.render(200, "flaky", panel=marker("flaky ok"))
        if name == "external":
            return self.output(302, "", {"Location": val("to", "/")})
        if name == "unsafe":
            return self.render(200, "unsafe", panel='<section id="project-panel" class="ds-card"><h2>unsafe</h2><script>window.__kitScript = 1</script><img src="/missing.png" onerror="window.__kitImg = 1" alt=""></section>')
        if name == "no-target":
            return self.render(200, "no-target", panel='<section id="other-panel" class="ds-card"><h2>other</h2></section>')
        if name == "json":
            return self.output(200, '{"ok":true}', {"Content-Type": "application/json; charset=utf-8"})
        return self.error_page(404, "غير موجود", "لا يوجد مسار اختبار بهذا الاسم.")

    # ---- routes ----
    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        url = urlsplit(self.path)
        p = url.path
        if p == "/design-system.html":
            return self.output(200, (PUBLIC / "design-system.html").read_bytes())
        if p in ("/design.css", "/kit.js"):
            mime = "text/css" if p.endswith(".css") else "text/javascript"
            return self.output(200, (PUBLIC / p.lstrip("/")).read_bytes(), {"Content-Type": mime + "; charset=utf-8", "Cache-Control": "public, max-age=300"})
        session = self.session(True)
        qs = parse_qs(url.query)
        q = qs.get("q", [""])[0][:100]
        if TEST_ROUTES and p.startswith("/__test/"):
            return self.test_routes(url, session)
        if p in ("/", "/projects"):
            return self.render(200, "المشاريع", q=q, panel=empty_panel())
        match = re.match(r"^/projects/([^/]+)$", p)
        if match:
            ident = unquote(match.group(1))
            project = pick(ident)
            if not project:
                return self.error_page(404, "المشروع غير موجود", "لا يوجد مشروع بالمعرّف المطلوب.", q)
            view = "tasks" if qs.get("view", [""])[0] == "tasks" else "overview"
            return self.render(200, project["title"], q=q, view=view, selected=ident, search_action="/projects/" + quote(ident, safe=""),
                               panel=panel_view(project, session, q=q, view=view, saved="saved" in qs), tab=tab_view(project, view, q))
        return self.error_page(404, "الصفحة غير موجودة", "لا يوجد مسار بهذا العنوان.")

    def do_POST(self):
        url = urlsplit(self.path)
        match = re.match(r"^/projects/([^/]+)/notes$", url.path)
        if not match:
            return self.error_page(404, "الصفحة غير موجودة", "لا يوجد مسار بهذا العنوان.")
        session = self.session()
        if not session:
            return self.error_page(403, "انتهت الجلسة", "انتهت الجلسة؛ أعد تحميل الصفحة ثم حاول مجددًا.")
        # CSRF: Origin must match exactly when present (so "null" is rejected), Fetch Metadata must be
        # same-origin, and the session-bound token must match (constant-time).
        expected = os.getenv("PUBLIC_ORIGIN", "http://" + self.headers.get("Host", ""))
        origin = self.headers.get("Origin")
        site = self.headers.get("Sec-Fetch-Site")
        if (origin is not None and origin != expected) or (site and site not in ("same-origin", "none")):
            return self.error_page(403, "مصدر الطلب غير مسموح", "رُفض الطلب لأن مصدره لا يطابق أصل التطبيق.")
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self.error_page(400, "طلب غير صالح", "صيغة الطلب غير صالحة.")
        if size > 16384:
            return self.error_page(413, "حجم النموذج كبير", "تجاوز النموذج الحد المسموح.")
        try:
            form = parse_qs(self.rfile.read(size).decode("utf-8"), keep_blank_values=True)
        except UnicodeDecodeError:
            return self.error_page(400, "طلب غير صالح", "ترميز الطلب غير صالح.")
        field = lambda key: form.get(key, [""])[0]
        if not secrets.compare_digest(field("csrf").encode("utf-8"), session["csrf"].encode("utf-8")):
            return self.error_page(403, "رمز الحماية غير صالح", "رمز حماية النموذج غير صالح؛ أعد تحميل الصفحة.")
        ident = unquote(match.group(1))
        project = pick(ident)
        if not project:
            return self.error_page(404, "المشروع غير موجود", "لا يوجد مشروع بالمعرّف المطلوب.")
        note = field("note")
        q = field("q")[:100]
        if not note.strip() or len(note) > 300:
            return self.render(422, project["title"], q=q, selected=ident, search_action="/projects/" + quote(ident, safe=""),
                               panel=panel_view(project, session, q=q, note=note, error="الملاحظة مطلوبة ويجب ألا تتجاوز 300 حرف."),
                               tab=tab_view(project, "overview", q))
        session["notes"][project["id"]] = note
        location = "/projects/" + quote(project["id"], safe="") + query(q=q, saved="1")
        return self.output(303, "<!doctype html><title>303</title>", {"Location": location})  # PRG


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", int(os.getenv("PORT", "4189"))), Handler)
    print("HTMZ_STARTER_READY http://127.0.0.1:" + str(server.server_address[1]), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
