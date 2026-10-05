import { GroupsDashboard } from "@/components/GroupsDashboard";

/**
 * /groups — top-level Feed page for the groups product.
 *
 * Layout and data fetching live in <GroupsDashboard />, which is
 * shared with the chat panel side bar (same event bus). Sub-routes
 * (`/groups/radar`, `/groups/diary`, `/groups/vault`, `/groups/quiz`)
 * are sibling pages under `src/app/groups/`.
 */
export default function GroupsPage() {
  return <GroupsDashboard />;
}