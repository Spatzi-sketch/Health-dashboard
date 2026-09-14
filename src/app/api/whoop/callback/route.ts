/**
 * WHOOP OAuth — step 2 of 2 (UNIMPLEMENTED STUB).
 *
 * The starter ships zero keys and zero network calls, so this route is a
 * deliberate 501 pointer, not a 404. A connecting agent replaces it with
 * the real thing, to the contract in SETUP-AGENT.md > "WHOOP":
 *
 *   - Verify the returned state against the HttpOnly cookie set by
 *     /api/whoop/connect; reject a mismatch.
 *   - Exchange the ?code for an access/refresh token pair by POSTing to
 *     WHOOP's token endpoint with WHOOP_CLIENT_ID + WHOOP_CLIENT_SECRET —
 *     server-side only.
 *   - Store the tokens server-side. They must NEVER be sent to the browser,
 *     logged, or embedded in a page.
 *   - Redirect to "/" so the dashboard rerenders with real vitals.
 */
export async function GET(): Promise<Response> {
  return new Response("Not wired yet — see SETUP-AGENT.md > WHOOP", {
    status: 501,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
