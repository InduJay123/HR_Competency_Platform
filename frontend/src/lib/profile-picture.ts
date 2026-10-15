export function pictureError(file: File): string {
  if (
    !/\.(jpe?g|png|webp)$/i.test(file.name) ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  ) {
    return "Choose a JPG, PNG or WEBP image.";
  }
  if (!file.size || file.size > 5 * 1024 * 1024) {
    return "Choose a non-empty image up to 5 MB.";
  }
  return "";
}
