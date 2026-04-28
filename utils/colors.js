function generateUserColor(username) {
  const colors = [
    "#FF6B6B",
    "#4ECDC4",
    "#45B7D1",
    "#FFA07A",
    "#98D8C8",
    "#F7DC6F",
    "#BB8FCE",
    "#85C1E2",
    "#F8B739",
    "#52C9B5",
    "#FF8B94",
    "#A8E6CF",
    "#FFD93D",
    "#6BCB77",
    "#4D96FF",
  ];

  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }

  return colors[Math.abs(hash) % colors.length];
}

module.exports = {
  generateUserColor,
};
