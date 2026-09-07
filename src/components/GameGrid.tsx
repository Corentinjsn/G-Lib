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
    // Colonnes de largeur fixe, et non `minmax(150px, 1fr)`.
    //
    // Les cartes s'etiraient pour remplir la rangee : selectionner un jeu
    // ouvrait le panneau de detail, la grille perdait 320 points, et toutes
    // les jaquettes retrecissaient d'un coup — celle qu'on venait de viser
    // comme les autres. La largeur ne depend plus de ce qui est ouvert ;
    // seul le nombre de cartes par rangee change.
    <div
      data-game-grid
      className="grid grid-cols-[repeat(auto-fill,170px)] justify-start gap-4 p-6"
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
