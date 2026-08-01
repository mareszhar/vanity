import App from './App.vue'
// The harness chrome — not a lane.
import './shell.css'
// The Tailwind lane's stylesheet (its Vite plugin fills it).
import './lanes/tailwind/theme.css'
// The Panda lane's stylesheet (its PostCSS plugin fills it).
import './lanes/panda/panda.css'

createApp(App).mount('#app')
