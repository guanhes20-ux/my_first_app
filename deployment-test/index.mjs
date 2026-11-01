export default {
  async fetch(request) {
    const path = new URL(request.url).pathname;
    const headers = {"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", {status:405,headers:{...headers,Allow:"GET, HEAD"}});
    }
    if (path !== "/" && path !== "/health") return new Response("Not found",{status:404,headers});
    const result = {ok:true,service:"renta-car-neon-test",runtime:"nodejs24",databaseTested:false,telegramConfigured:false};
    if (path === "/health") return Response.json(result,{headers});
    return new Response(request.method === "HEAD" ? null : "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Renta Car - Neon test</title></head><body><h1>Renta Car: Neon Functions works</h1><p>HTTPS test deployment is running.</p><p>This is a deployment check, not the rental website. Database and Telegram are not tested here.</p><a href=\"/health\">Health check</a></body></html>",{headers:{...headers,"Content-Type":"text/html; charset=utf-8","Content-Security-Policy":"default-src 'none'; base-uri 'none'; frame-ancestors 'none'"}});
  }
};
