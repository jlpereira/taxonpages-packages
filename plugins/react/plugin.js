import react from '@vitejs/plugin-react'

export default function () {
  return {
    name: 'react',

    vite() {
      return {
        plugins: [react()],
        optimizeDeps: { include: ['react', 'react-dom'] }
      }
    }
  }
}
