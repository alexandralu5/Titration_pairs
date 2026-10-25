import './BottomNav.css'
import type { FC } from 'react'
import { Nav, Navbar } from 'react-bootstrap'
import { NavLink } from 'react-router-dom'
import { ROUTES, ROUTE_LABELS } from '../Routes'

// Нижняя навигационная панель: 4 пункта, доступны только «Лента» и «Плитка»
export const BottomNav: FC = () => (
  <Navbar className="bottomNav">
    <Nav className="bottomNavItems">
      <Nav.Link as={NavLink} to={ROUTES.FEED}>
        {ROUTE_LABELS.FEED}
      </Nav.Link>
      <Nav.Link disabled>{ROUTE_LABELS.ADD}</Nav.Link>
      <Nav.Link as={NavLink} to={ROUTES.GRID}>
        {ROUTE_LABELS.GRID}
      </Nav.Link>
      <Nav.Link disabled>{ROUTE_LABELS.LOGIN}</Nav.Link>
    </Nav>
  </Navbar>
)
