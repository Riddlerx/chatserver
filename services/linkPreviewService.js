const axios = require("axios");
const { parse } = require("node-html-parser");

module.exports = {
  getLinkPreview: async (text) => {
    // Basic regex to find the first URL in the text
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const match = text.match(urlRegex);

    if (!match) return null;

    const url = match[0];

    try {
      const response = await axios.get(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        timeout: 3000,
      });

      const root = parse(response.data);

      const title =
        root.querySelector('meta[property="og:title"]')?.getAttribute("content") ||
        root.querySelector("title")?.textContent ||
        url;

      const description =
        root.querySelector('meta[property="og:description"]')?.getAttribute("content") ||
        root.querySelector('meta[name="description"]')?.getAttribute("content") ||
        "";

      const image =
        root.querySelector('meta[property="og:image"]')?.getAttribute("content") ||
        root.querySelector('meta[name="twitter:image"]')?.getAttribute("content") ||
        "";

      return {
        url,
        title,
        description,
        image,
      };
    } catch (error) {
      console.warn(`Link preview failed for ${url}:`, error.message);
      return null;
    }
  },
};
