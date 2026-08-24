import { navTabs } from "@/lib/mock-data";
import { Icon } from "@/components/ui/Icon";

export function Navbar() {
  return (
    <header className="flex h-[72px] w-full shrink-0 items-center justify-between border-b border-[#242831] bg-[#111317] px-8">
      <div className="flex items-center gap-2">
        <div
          className="flex size-9 items-center justify-center rounded-[18px]"
          style={{
            backgroundImage:
              "linear-gradient(45deg, rgb(255, 46, 147) 25%, rgb(255, 138, 86) 75%)",
          }}
        >
          <Icon name="zap" size={20} />
        </div>
        <p className="text-[22px] font-extrabold text-white">
          Name
          <span
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage:
                "linear-gradient(14deg, rgb(255, 46, 147) 25%, rgb(255, 138, 86) 75%)",
            }}
          >
            App
          </span>
        </p>
      </div>

      <nav className="flex items-center gap-8">
        {navTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`flex items-center gap-2 px-1 py-3 ${
              tab.active
                ? "border-b-2 border-[#ff2e93]"
                : "border-b-2 border-transparent"
            }`}
          >
            <Icon name={tab.icon} size={18} />
            <span
              className={`text-[15px] ${
                tab.active
                  ? "font-bold text-white"
                  : "font-medium text-[#a0a5b5]"
              }`}
            >
              {tab.label}
            </span>
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-4">
        <button
          type="button"
          className="relative flex size-10 items-center justify-center rounded-[20px] bg-[#2a2d37]"
          aria-label="Thông báo"
        >
          <Icon name="bellDot" size={20} />
          <span className="absolute right-2.5 top-2.5 size-2">
            <Icon name="notifDot" size={8} />
          </span>
        </button>

        <button
          type="button"
          className="flex items-center gap-2 rounded-full bg-[#2a2d37] p-1"
        >
          <div className="size-8 rounded-2xl bg-[#c6c6c6]" />
          <span className="text-[13px] font-semibold text-white">Name</span>
          <Icon name="chevronDown" size={14} />
        </button>
      </div>
    </header>
  );
}
