import { onRequestGet as __api_unlock_js_onRequestGet } from "/home/claude/ai-company/functions/api/unlock.js"
import { onRequest as __jusho_check_app__middleware_js_onRequest } from "/home/claude/ai-company/functions/jusho-check/app/_middleware.js"

export const routes = [
    {
      routePath: "/api/unlock",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_unlock_js_onRequestGet],
    },
  {
      routePath: "/jusho-check/app",
      mountPath: "/jusho-check/app",
      method: "",
      middlewares: [__jusho_check_app__middleware_js_onRequest],
      modules: [],
    },
  ]