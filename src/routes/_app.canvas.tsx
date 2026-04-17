import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/canvas')({
  component: CanvasLayout,
})

function CanvasLayout() {
  return <Outlet />
}
