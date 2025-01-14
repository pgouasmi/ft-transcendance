export function announceMatch(player1_name, player2_name) {
  const matchDiv = document.createElement("div");
  matchDiv.id = "match-announcement";
  matchDiv.classList = "game-popover";
  matchDiv.innerHTML = `
    <div class="text-center">
      <h2></h2>
    </div>
  `;
  matchDiv.querySelector("h2").innerText = `${player1_name} VS ${player2_name}`;
  document.body.appendChild(matchDiv);
}

export function announceWinner(msg) {
  const winnerDiv = document.createElement("div");
  winnerDiv.id = "winner-announcement";
  winnerDiv.classList.add("game-popover");
  winnerDiv.innerHTML = `
      <h2></h2>
  `;
  winnerDiv.querySelector("h2").innerText = msg;
  document.body.appendChild(winnerDiv);
  winnerDiv.classList.add("visible");
}