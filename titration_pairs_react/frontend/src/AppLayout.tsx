import type { FC } from 'react'
import { Outlet } from 'react-router-dom'
import { BottomNav } from './components/BottomNav'

// Общая оболочка: мобильный экран со страницей и нижней навигацией
export const AppLayout: FC = () => (
  <div className="mobileContainer">
    <Outlet />
    <BottomNav />
  </div>
)
