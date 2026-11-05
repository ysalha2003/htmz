"""Reference backend using Python standard library only. Not a production WSGI server."""
import html
import json
import os
import secrets
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlsplit

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "public"
PROJECTS = json.loads((ROOT / "projects.json").read_text(encoding="utf-8"))
TEMPLATE = (PUBLIC / "index.html").read_text(encoding="utf-8")
SESSIONS = {}  # Demo only: substitute proper auth and durable session storage.
CSP = ("default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; "
       "object-src 'none'; base-uri 'none'; form-action 'self'; frame-src 'self'; frame-ancestors 'self'")
esc = lambda value: html.escape(str(value if value is not None else ""), quote=True)
pick = lambda ident: next((p for p in PROJECTS if p["id"] == ident), None)

def project_list(query=""):
    entries = [p for p in PROJECTS if query.strip().casefold() in p["title"].casefold()]
    li = "".join(
        '<li><a href="/project?id=' + quote(p["id"]) + '#project-panel" target="htmz">'
        + esc(p["title"]) + '</a><small>' + esc(p["status"]) + '</small></li>'
        for p in entries
    )
    body = '<ul class="ds-project-list">' + li + '</ul>' if entries else '<p class="ds-empty">لا توجد مشاريع مطابقة.</p>'
    return '<section id="project-list" aria-label="نتائج البحث"><h2>قائمة المشاريع</h2>' + body + '</section>'

def tab(project, view="overview"):
    if view == "tasks":
        body = '<h3 tabindex="-1" data-focus>المهام الأساسية</h3><ul>' + ''.join(
            '<li>' + esc(t) + '</li>' for t in project["tasks"]) + '</ul>'
    else:
        body = '<h3 tabindex="-1" data-focus>ملخص المشروع</h3><p class="ds-muted">مثال يوضح استبدال أجزاء HTML من الخادم دون JavaScript لتوليد الواجهة.</p>'
    return '<div id="project-tab" class="ds-panel" data-focus-on-swap>' + body + '</div>'

def panel(project, session, note=None, error="", saved=False):
    existing = session["notes"].get(project["id"], project["note"])
    text = existing if note is None else note
    notice = ('<div class="ds-alert ds-alert-error" role="alert">' + esc(error) + '</div>') if error else (
        '<div class="ds-alert ds-alert-success" role="status">تم حفظ الملاحظة بنجاح.</div>' if saved else '')
    ident = quote(project["id"])
    return ('<section id="project-panel" class="ds-card" data-focus-on-swap data-result="' + ('error' if error else 'ok') + '">'
        + '<div class="ds-detail-title"><h2 tabindex="-1" data-focus>' + esc(project["title"])
        + '</h2><span class="ds-pill">' + esc(project["status"]) + '</span></div>'
        + '<nav class="ds-tabs" aria-label="أقسام المشروع"><a href="/tab?id=' + ident + '&view=overview#project-tab" target="htmz">نظرة عامة</a>'
        + '<a href="/tab?id=' + ident + '&view=tasks#project-tab" target="htmz">المهام</a></nav>'
        + '<div class="ds-section">' + tab(project) + '</div>'
        + '<section class="ds-section" aria-label="ملاحظات المشروع"><h3>الملاحظات</h3>' + notice
        + '<form action="/notes#project-panel" method="post" target="htmz" class="ds-note-form">'
        + '<input type="hidden" name="csrf" value="' + esc(session["csrf"])
        + '"><input type="hidden" name="id" value="' + esc(project["id"]) + '">'
        + '<label>وصف مختصر<textarea name="note" maxlength="300" rows="4" required>' + esc(text)
        + '</textarea></label><button class="ds-button" type="submit">حفظ الملاحظة</button></form></section></section>')

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print("http:", fmt % args, flush=True)

    def output(self, status, data, content_type="text/html; charset=utf-8", cookie=None):
        self.send_response(status)
        for k,v in {
            "Content-Type": content_type, "Content-Security-Policy": CSP,
            "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
            "X-Frame-Options": "SAMEORIGIN", "Cache-Control": "no-store",
        }.items(): self.send_header(k,v)
        if cookie: self.send_header("Set-Cookie", "htmz_sid=" + cookie + "; HttpOnly; SameSite=Lax; Path=/" + ("; Secure" if os.getenv("PUBLIC_ORIGIN","").startswith("https://") else ""))
        data = data.encode("utf-8") if isinstance(data, str) else data
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def session(self, create=False):
        try:
            jar = SimpleCookie();jar.load(self.headers.get("Cookie",""))
            sid = jar["htmz_sid"].value if "htmz_sid" in jar else None
        except Exception:
            sid = None
        if sid in SESSIONS: return SESSIONS[sid], None
        if not create: return None, None
        sid = secrets.token_hex(24)
        SESSIONS[sid] = {"csrf":secrets.token_hex(24),"notes":{}}
        return SESSIONS[sid], sid

    def failure(self,status,message):
        self.output(status,'<section id="project-panel" class="ds-card" data-focus-on-swap data-result="error"><h2 tabindex="-1" data-focus>تعذّر تنفيذ الطلب</h2><p class="ds-alert ds-alert-error" role="alert">'+esc(message)+'</p></section>')

    def do_GET(self):
        u = urlsplit(self.path);p=u.path
        if p == "/design-system.html":
            return self.output(200,(PUBLIC / "design-system.html").read_bytes())
        if p in ("/design.css","/runtime.js"):
            mime = "text/css" if p.endswith(".css") else "text/javascript"
            return self.output(200,(PUBLIC/p.lstrip("/")).read_bytes(),mime+"; charset=utf-8")
        if p == "/":
            session,cookie = self.session(True)
            page = TEMPLATE.replace("{{PROJECT_LIST}}",project_list()).replace("{{PROJECT_PANEL}}",panel(PROJECTS[0],session))
            return self.output(200,page,cookie=cookie)
        session,_ = self.session()
        if not session: return self.failure(403,"انتهت الجلسة؛ حدّث الصفحة.")
        qs=parse_qs(u.query)
        val=lambda key: qs.get(key,[""])[0]
        if p == "/projects":return self.output(200,project_list(val("q")[:100]))
        if p == "/project":
            project=pick(val("id"))
            return self.output(200,panel(project,session)) if project else self.failure(404,"المشروع غير موجود.")
        if p == "/tab":
            project=pick(val("id"))
            return self.output(200,tab(project,val("view"))) if project else self.output(404,'<div id="project-tab" data-result="error">المشروع غير موجود.</div>')
        return self.output(404,"<h1>404</h1>")

    def do_POST(self):
        if urlsplit(self.path).path != "/notes":return self.output(404,"<h1>404</h1>")
        session,_ = self.session()
        if not session:return self.failure(403,"انتهت الجلسة؛ حدّث الصفحة.")
        # Adopted iframe forms can send Origin: null; the CSRF token is still mandatory.
        expected = os.getenv("PUBLIC_ORIGIN", "http://" + self.headers.get("Host",""))
        origin = self.headers.get("Origin")
        fetch_site = self.headers.get("Sec-Fetch-Site")
        if (origin not in (None, expected, "null") or (fetch_site and fetch_site not in ("same-origin", "none"))):
            return self.failure(403,"مصدر الطلب غير مسموح.")
        try:
            size = int(self.headers.get("Content-Length","0"))
        except ValueError:
            return self.failure(400,"صيغة طلب غير صالحة.")
        if size > 16384 or size < 1:return self.failure(413,"حجم النموذج غير صالح.")
        try:
            form=parse_qs(self.rfile.read(size).decode("utf-8"),keep_blank_values=True)
        except UnicodeDecodeError:
            return self.failure(400,"ترميز الطلب غير صالح.")
        field=lambda key:form.get(key,[""])[0]
        if not secrets.compare_digest(field("csrf").encode("utf-8"),session["csrf"].encode("utf-8")):
            return self.failure(403,"رمز حماية النموذج غير صالح.")
        project=pick(field("id"))
        if not project:return self.failure(404,"المشروع غير موجود.")
        note=field("note")
        if not note.strip() or len(note)>300:
            return self.output(422,panel(project,session,note=note,error="الملاحظة مطلوبة ويجب ألا تتجاوز 300 حرف."))
        session["notes"][project["id"]]=note
        return self.output(200,panel(project,session,saved=True))

if __name__ == "__main__":
    server=ThreadingHTTPServer(("127.0.0.1",int(os.getenv("PORT","4189"))),Handler)
    print("HTMZ_STARTER_READY http://127.0.0.1:"+str(server.server_address[1]),flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()
