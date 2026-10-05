import { Navbar } from "@/components/Navbar";

/**
 * /discover layout
 *
 * The reels player wants the full viewport, but we still want the
 * global Navbar so the user can hop back to home / groups / messages
 * without the page being an island.
 *
 * Implementation notes:
 *   - `flex flex-col` so the Navbar sits at the top with its fixed
 *     height (72px) and the rest of the height flows to the panel.
 *   - The `overflow-hidden` on the wrapper is what allows the
 *     `<DiscoverMainPanel>` to safely use `h-full` for its snap
 *     scroller — without it, the snap container would expand to
 *     its content height and the snap points would be lost.
 *   - Incoming call notifications are NOT mounted here. They live in
 *     the Dashboard surface (`useCallNotifications2`) so we don't
 *     have to duplicate the hook state in two layouts.
 */
export default function DiscoverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-black">
      <Navbar />
      <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}