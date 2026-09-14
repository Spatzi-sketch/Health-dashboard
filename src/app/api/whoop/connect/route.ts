/**
 * WHOOP OAuth — step 1 of 2 (UNIMPLEMENTED STUB).
 *
 * The starter ships zero keys and zero network calls, so this route is a
 * deliberate 501 pointer, not a 404. A connecting agent replaces it with
 * the real thing, to the contract in SETUP-AGENT.md > "WHOOP":
 *
 *   - Build the WHOOP authorize URL with WHOOP_CLIENT_ID (from .env.local),
 *     redirect_uri http://localhost:3000/api/whoop/callback,
 *     response_type=code, the WHOOP read scopes, and a random state value
 *     stored in an HttpOnly cookie.
 *   - Respond with a 302 redirect to that URL. Secrets never reach the
 *     browser; only the public client id appears in the redirect.
 */
export async function GET(): Promise<Response> {
  return new Response("Not wired yet — see SETUP-AGENT.md > WHOOP", {
    status: 501,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
