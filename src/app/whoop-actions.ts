"use server";

import { redirect } from "next/navigation";

/**
 * Demo stand-in for the production WHOOP sync server action.
 *
 * The starter renders entirely from fixture data — there is no WHOOP
 * account, no OAuth flow and no database behind this button. The action
 * keeps the exact production wiring (a form posts here) and simply lands
 * back on the dashboard with the sync banner.
 */
export async function syncWhoopAction(): Promise<never> {
  redirect("/?sync=complete");
}
