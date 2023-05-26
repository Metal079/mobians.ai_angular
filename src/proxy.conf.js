const PROXY_CONFIG = [
  {
    context: [
      "/weatherforecast", "/StableDiffusion/txt2img"
    ],
    target: "https://localhost:7246",
    secure: false
  }
]

module.exports = PROXY_CONFIG;
