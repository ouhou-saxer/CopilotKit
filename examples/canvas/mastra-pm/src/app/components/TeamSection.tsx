import type { BoardState } from "@/lib/state";
import { Avatar } from "./Avatar";

interface TeamSectionProps {
  state: BoardState;
}

export function TeamSection({ state }: TeamSectionProps) {
  return (
    <div className="p-8 border-b border-white/10">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-2">Team</h2>
        <p className="text-gray-200 text-sm">
          Zuständigkeiten von SaXer Verwaltungen und SaXer Immobilien
        </p>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {state?.users?.map((user) => (
          <div
            key={user.id}
            className="flex-shrink-0 bg-white/10 rounded-xl p-4 border border-white/10 hover:bg-white/20 transition-all duration-200 min-w-[200px] max-w-[360px]"
          >
            <div className="flex items-center gap-3">
              <Avatar name={user.name} image={user.image} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-white text-sm truncate">
                  {user.name}
                </div>
                <div className="text-xs text-gray-300 truncate">
                  {user.role}
                </div>
                <div className="text-xs text-gray-200 mt-1 line-clamp-2">
                  {user.summary}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
