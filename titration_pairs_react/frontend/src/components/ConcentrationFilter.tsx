import './ConcentrationFilter.css'
import type { FC } from 'react'
import { Button, Form } from 'react-bootstrap'

interface Props {
  value: string
  setValue: (value: string) => void
  onSubmit: () => void
  loading?: boolean
}

// Фильтр плитки по минимальной концентрации (М)
export const ConcentrationFilter: FC<Props> = ({ value, setValue, onSubmit, loading }) => (
  <div className="filterBox">
    <Form.Label htmlFor="concentration" className="filterLabel">
      Мин. концентрация: {value} М
    </Form.Label>
    <div className="filterForm">
      <Form.Range
        id="concentration"
        min={0}
        max={0.3}
        step={0.01}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <Button size="sm" className="filterButton" disabled={loading} onClick={onSubmit}>
        ОК
      </Button>
    </div>
  </div>
)
