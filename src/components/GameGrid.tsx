import type { MouseEvent } from "react";
import type { Game } from "../types";
import { GameCard } from "./GameCard";

interface Props {
  games: Game[];
  selectedId: string | null;
  onSelect: (game: Game) => void;
  onLaunch: (game: Game) => void;
  onContextMenu: (game: Game, event: MouseEvent) => void;
  onToggleFavorite: (game: Game) => void;
}

export function GameGrid({
  games,
  selectedId,
  onSelect,
  onLaunch,
  onContextMenu,
  onToggleFavorite,
}: Props) {
  return (
    <div
      data-game-grid
      className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4 p-6"
    >
      {games.map((game) => (
        <GameCard
          key={game.id}
          game={game}
          selected={game.id === selectedId}
          onSelect={() => onSelect(game)}
          onLaunch={() => onLaunch(game)}
          onContextMenu={(event) => onContextMenu(game, event)}
          onToggleFavorite={() => onToggleFavorite(game)}
        />
      ))}
    </div>
  );
}
