export function generateUserColor(username: string) {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c = (hash & 0x00ffffff).toString(16).toUpperCase();
  return "#" + "00000".substring(0, 6 - c.length) + c;
}

export function getAvatarStyle(profilePicture?: string, username?: string) {
  if (profilePicture) {
    return {
      backgroundImage: `url("${profilePicture}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  return {
    backgroundColor: generateUserColor(username || 'user'),
  };
}
