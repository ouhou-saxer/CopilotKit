import type { BoardState, BoardTask, BoardUser } from "@/lib/state";
import { AREA_INFO } from "@/lib/types";
import type { Company } from "@/lib/types";
import { Avatar } from "./Avatar";

interface KanbanBoardProps {
  state: BoardState;
}

const COLUMNS: { status: BoardTask["status"]; title: string }[] = [
  { status: "todo", title: "Offen" },
  { status: "in-progress", title: "In Arbeit" },
  { status: "done", title: "Erledigt" },
];

export function KanbanBoard({ state }: KanbanBoardProps) {
  return (
    <div className="flex-1 p-8 overflow-hidden">
      <div className="flex gap-8 h-full overflow-x-auto overflow-y-hidden">
        {COLUMNS.map(({ status, title }) => {
          const columnTasks =
            state?.tasks?.filter((task) => task.status === status) ?? [];
          return (
            <div
              key={status}
              className="bg-white/10 rounded-2xl p-6 border border-white/10 flex flex-col h-full min-w-[350px] w-[350px] flex-shrink-0"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-white">{title}</h3>
                <span className="text-sm text-gray-300 bg-white/10 px-3 py-1 rounded-full">
                  {columnTasks.length}
                </span>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto">
                {columnTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    assignedUser={state?.users?.find(
                      (u) => u.id === task.assignedTo,
                    )}
                  />
                ))}
                {columnTasks.length === 0 && (
                  <div className="text-center py-8 text-gray-300 text-sm">
                    Keine Aufgaben in dieser Spalte
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const COMPANY_BADGE: Record<Company, string> = {
  verwaltungen: "bg-sky-400/30 border-sky-200/40",
  immobilien: "bg-amber-400/30 border-amber-200/40",
  gemeinsam: "bg-emerald-400/30 border-emerald-200/40",
};

interface TaskCardProps {
  task: BoardTask;
  assignedUser?: BoardUser;
}

function TaskCard({ task, assignedUser }: TaskCardProps) {
  const area = task.area ? AREA_INFO[task.area] : undefined;
  return (
    <div className="bg-white/10 rounded-xl p-4 border border-white/10 hover:bg-white/20 transition-all duration-200 hover:shadow-lg cursor-pointer group">
      {area && (
        <span
          className={`inline-block mb-2 px-2 py-0.5 rounded-full border text-[11px] font-medium text-white ${COMPANY_BADGE[area.company]}`}
        >
          {area.label}
        </span>
      )}
      <div className="font-semibold text-white mb-2 group-hover:text-white/90 transition-colors">
        {task.name}
      </div>
      <div className="text-sm text-gray-200 mb-4 leading-relaxed">
        {task.description}
      </div>
      {assignedUser && (
        <div className="flex items-center gap-3 pt-3 border-t border-white/10">
          <Avatar
            name={assignedUser.name}
            image={assignedUser.image}
            size="sm"
          />
          <div className="flex-1">
            <div className="text-xs font-medium text-white">
              {assignedUser.name}
            </div>
            <div className="text-xs text-gray-300">{assignedUser.role}</div>
          </div>
        </div>
      )}
    </div>
  );
}
