const tailwindcss = require('tailwindcss')
const autoprefixer = require('autoprefixer')
const tailwindNesting = require('tailwindcss/nesting')

const config = {
  plugins: [
    tailwindNesting(),
    //Some plugins, like tailwindcss/nesting, need to run before Tailwind,
    tailwindcss(),
    //But others, like autoprefixer, need to run after,
    autoprefixer,
  ],
}

module.exports = config
