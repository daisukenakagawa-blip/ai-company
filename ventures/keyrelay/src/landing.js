// KeyRelay の案内ページ（英語・世界向け）。事実だけを書く：実績・利用者数・推薦の声は載せない
export const LANDING = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>KeyRelay — Lemon Squeezy License API compatible license keys</title>
<meta name="description" content="Lemon Squeezy stops processing payments on March 31, 2027, and Stripe Managed Payments does not issue license keys. KeyRelay keeps your existing license keys and activations working: change one base URL.">
<style>
:root{--bg:#fbfbf9;--fg:#1c1f23;--mute:#5b6370;--line:#e3e5e8;--acc:#2f5d50;--code:#f1f3f2}
@media (prefers-color-scheme:dark){:root{--bg:#141716;--fg:#e8ebe9;--mute:#a2aaa6;--line:#2b302e;--acc:#7fc4ad;--code:#1d2220}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.65 -apple-system,"Segoe UI",Inter,sans-serif}
main{max-width:760px;margin:0 auto;padding:40px 18px 80px}
h1{font-size:30px;line-height:1.25;margin:0 0 12px}h2{font-size:20px;margin:36px 0 10px}
p,li{color:var(--fg)}.mute{color:var(--mute);font-size:14px}
code,pre{font:13.5px ui-monospace,Menlo,Consolas,monospace;background:var(--code);border-radius:6px}
code{padding:1px 5px}pre{padding:12px 14px;overflow-x:auto}
.box{border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin:16px 0}
input{font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg);width:220px;max-width:100%}
button{font:inherit;background:var(--acc);color:var(--bg);border:0;border-radius:8px;padding:9px 16px;cursor:pointer}
a{color:var(--acc)}
</style></head><body><main>
<h1>Keep your Lemon Squeezy license keys working after March 31, 2027</h1>
<p>Lemon Squeezy <a href="https://www.lemonsqueezy.com/blog/saying-goodbye-to-lemon-squeezy">stops processing payments on March 31, 2027</a>. Its recommended successor, Stripe Managed Payments, <a href="https://docs.lemonsqueezy.com/migration/comparison">does not include license keys</a>. If your app calls the Lemon Squeezy License API, it needs a new home before then.</p>
<p><b>KeyRelay speaks the same License API.</b> Same endpoints, same form fields, same JSON fields. You change one base URL, import your existing keys and activations, and your customers' installs keep validating.</p>

<h2>How it works</h2>
<ol>
<li><b>Create a workspace</b> below. You get an admin token (shown once).</li>
<li><b>Import</b> your keys and activations with a Lemon Squeezy API key (read access). Instance IDs are preserved, so <code>validate</code> with an existing <code>instance_id</code> keeps working.</li>
<li><b>Ship an app update</b> that points to your KeyRelay base URL instead of <code>https://api.lemonsqueezy.com</code>.</li>
<li><b>New sales:</b> add a Stripe webhook (<code>checkout.session.completed</code>) from your own Stripe account. KeyRelay issues a key per paid session and shows it on a claim page you can use as your Checkout success URL. Payments go to your Stripe account; KeyRelay never touches your money.</li>
</ol>
<pre>curl -X POST https://&lt;host&gt;/&lt;workspace&gt;/v1/licenses/validate \\
  -H "Accept: application/json" \\
  -d license_key=YOUR-KEY -d instance_id=YOUR-INSTANCE-ID</pre>

<h2>Create a workspace (free beta)</h2>
<div class="box">
<form id="f"><input id="id" placeholder="workspace id (a-z, 0-9, -)" required pattern="[a-z0-9][a-z0-9-]{2,31}"> <input id="nm" placeholder="product name (optional)"> <button>Create</button></form>
<pre id="out" hidden></pre>
<p class="mute">Free during the beta. If paid plans are introduced later, beta workspaces will get advance notice on this page and in the GitHub repository, and existing keys will keep validating during any transition.</p>
</div>

<h2>Admin API</h2>
<pre>POST /&lt;ws&gt;/admin/import/lemonsqueezy   api_key=...        (Bearer &lt;admin token&gt;)
POST /&lt;ws&gt;/admin/settings              stripe_webhook_secret=whsec_... default_activation_limit=1
POST /&lt;ws&gt;/admin/keys                  activation_limit=2 expires_at=2027-12-31T00:00:00Z
POST /&lt;ws&gt;/admin/keys/&lt;key&gt;/disable
GET  /&lt;ws&gt;/admin/stats
GET  /&lt;ws&gt;/admin/export               (all your keys and activations as JSON)
POST /&lt;ws&gt;/admin/delete               (deletes the workspace and all its data)
POST /&lt;ws&gt;/webhooks/stripe             (Stripe webhook endpoint)
GET  /&lt;ws&gt;/claim?session_id={CHECKOUT_SESSION_ID}</pre>

<h2>Limits and honest caveats</h2>
<ul>
<li>This is a beta run on Cloudflare Workers' free tier. There is no uptime guarantee yet.</li>
<li>Lemon Squeezy's API key is used only for the import request and is not stored.</li>
<li>Error messages follow the Lemon Squeezy format, but exact wording may differ. Check your app's error handling.</li>
<li>Source code: <a href="https://github.com/daisukenakagawa-blip/ai-company/tree/main/ventures/keyrelay">GitHub</a> (MIT). You can self-host it.</li>
</ul>
<p class="mute"><a href="/terms">Terms &amp; privacy</a> · Questions: open an issue on GitHub. KeyRelay is not affiliated with Lemon Squeezy or Stripe.</p>
</main>
<script>
document.getElementById("f").onsubmit=async e=>{e.preventDefault();const o=document.getElementById("out");o.hidden=false;o.textContent="Creating...";
const b=new URLSearchParams({id:document.getElementById("id").value,name:document.getElementById("nm").value});
const r=await fetch("/signup",{method:"POST",body:b});const j=await r.json();
o.textContent=r.ok?"Workspace: "+j.tenant+"\\nLicense API base: "+j.license_api_base+"\\nAdmin token (save it now, it is shown only once):\\n"+j.admin_token:"Error: "+j.error;};
</script></body></html>`;

export const TERMS = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KeyRelay terms</title>
<style>body{font:16px/1.65 -apple-system,"Segoe UI",sans-serif;max-width:720px;margin:40px auto;padding:0 18px}</style></head><body>
<h1>Terms and privacy (beta)</h1>
<ul>
<li>KeyRelay is provided free of charge during the beta, as is, without warranty of availability or fitness for a particular purpose.</li>
<li>You are responsible for your products, your customers, and your own payment provider account. KeyRelay does not process payments.</li>
<li>Stored data: license keys, activation instance IDs and names, and the order/customer fields you import or send through your webhook (which may include customer name and email). It is used only to answer your License API requests and is not sold or shared.</li>
<li>Lemon Squeezy API keys sent for import are used for that request only and are not stored.</li>
<li>You can delete your workspace and all its data at any time with <code>POST /&lt;workspace&gt;/admin/delete</code> (admin token required).</li>
<li>Abuse (e.g., using workspaces to host unrelated content or to bypass others' licensing) leads to removal.</li>
</ul>
<p><a href="/">Back</a></p></body></html>`;
