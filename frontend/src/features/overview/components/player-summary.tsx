import { Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Overview } from "../overview-schema";
import { Unavailable } from "./unavailable";

export function PlayerSummary({ players }: { players: Overview["players"] }) {
  return (
    <Card className="min-w-0 p-[22px]">
      <div className="flex items-center gap-3 [&>svg]:w-[22px] [&>svg]:text-primary-hover [&_h2]:m-0">
        <Users aria-hidden="true" />
        <div><p className="mb-[7px] text-[0.72rem] font-medium tracking-[0.13em] text-primary uppercase">Right now</p><h2>Players</h2></div>
      </div>
      {players.available ? (
        <>
          <p className="mt-6 mb-3.5"><strong className="text-[2.8rem] tracking-[-0.06em]">{players.value.online}</strong><span className="text-muted-foreground"> / {players.value.max} online</span></p>
          {players.value.names.length > 0 ? (
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {players.value.names.map((name) => <li className="max-w-full overflow-hidden rounded-full bg-muted px-[9px] py-[5px] text-xs text-ellipsis whitespace-nowrap" key={name}>{name}</li>)}
            </ul>
          ) : <p className="text-muted-foreground">The server is quiet.</p>}
        </>
      ) : <Unavailable message={players.message} />}
    </Card>
  );
}
