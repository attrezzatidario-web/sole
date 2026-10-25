/** @type {import('next').NextConfig} */
// Sito 100% statico (cartella "out"), pubblicato da GitHub Pages.
// NEXT_PUBLIC_BASE_PATH = sottocartella del sito (es. "/sole" per utente.github.io/sole/).
// La imposta da sola la GitHub Action; vuota in locale.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig = {
  reactStrictMode: true,
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

module.exports = nextConfig;
