// SDK-independent host prototype. Run via hosts.mjs, never imported by production.
export const client = `
const host=document.createElement('vanity-review-probe');host.hidden=true;
const shadow=host.attachShadow({mode:'open'});shadow.innerHTML='<style>:host{position:fixed;inset:0;pointer-events:none}button{pointer-events:auto}</style><button>Review</button><output></output>';
document.body.append(host);
const open=()=>{host.hidden=false;document.documentElement.setAttribute('data-vanity-keyboard-owned','')};
const close=()=>{host.hidden=true;document.documentElement.removeAttribute('data-vanity-keyboard-owned')};
window.__reviewProbe={open,close,records:[]};
const onKey=e=>{if(document.documentElement.hasAttribute('data-mesurer-keyboard-owned'))return;if(e.ctrlKey&&e.altKey&&e.key.toLowerCase()==='v'){e.preventDefault();open()}else if(e.key==='Escape'&&!host.hidden){e.preventDefault();close()}};window.addEventListener('keydown',onKey);
import.meta.hot.on('vanity:review-probe',record=>{window.__reviewProbe.records.push(record);shadow.querySelector('output').textContent=record.text});
import.meta.hot.on('vanity:review-open',open);
if(import.meta.hot){import.meta.hot.accept();import.meta.hot.dispose(()=>{window.removeEventListener('keydown',onKey);host.remove();document.documentElement.removeAttribute('data-vanity-keyboard-owned')})};
`
export function reviewPlugin(observations = {}) {
  return { name: 'review-spike-model', apply: 'serve', configureServer(server) {
    observations.servers = (observations.servers ?? 0) + 1
    observations.server = server
    server.middlewares.use('/__review/state', (req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ kitSetups: observations.kitSetups ?? 0, kitHosts: observations.kitHosts ?? [], servers: observations.servers ?? 0, kitRegistrations: observations.kitRegistrations ?? 0, commands: observations.kit?.commands.list().map(item => item.id) ?? [], docks: observations.kit?.docks.values().map(item => item.id) ?? [] }))
    })
    server.middlewares.use('/__review/push', (req, res) => {
      server.ws.send({ type: 'custom', event: 'vanity:review-probe', data: { text: 'agent replied' } })
      res.end('ok')
    })
    server.middlewares.use('/__review/', (req, res) => {
      res.setHeader('Content-Type', 'text/html')
      res.end('<!doctype html><p>Vanity review fixture</p>')
    })
  }, resolveId(id) {
    if (id === 'virtual:review-probe')
      return '\0virtual:review-probe'
  }, load(id) {
    if (id === '\0virtual:review-probe')
      return client
  }, devtools: { setup(ctx) {
    if (ctx.mode !== 'dev')
      return
    observations.kitSetups = (observations.kitSetups ?? 0) + 1;
    (observations.kitHosts ??= []).push({ ssr: ctx.viteConfig?.build?.ssr, root: ctx.viteConfig?.root, mode: ctx.mode })
    if (ctx.viteConfig?.build?.ssr)
      return
    observations.kitRegistrations = (observations.kitRegistrations ?? 0) + 1
    observations.kit = ctx
    ctx.commands.register({ id: 'vanity.review', title: 'Open Vanity review', handler() {
      ctx.viteServer.ws.send({ type: 'custom', event: 'vanity:review-open', data: {} })
    } })
    ctx.docks.register({ id: 'vanity.review', title: 'Vanity', type: 'iframe', url: '/__review/' })
  } } }
}
