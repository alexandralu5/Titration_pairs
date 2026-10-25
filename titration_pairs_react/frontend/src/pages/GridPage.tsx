import './GridPage.css'
import { type FC, useEffect, useState } from 'react'
import { Col, Row, Spinner } from 'react-bootstrap'
import { useNavigate } from 'react-router-dom'
import { ConcentrationFilter } from '../components/ConcentrationFilter'
import { TitrationCard } from '../components/TitrationCard'
import { type TitrationPair, getTitrationPairs } from '../modules/titrationApi'
import { ROUTES } from '../Routes'

const GridPage: FC = () => {
  const navigate = useNavigate()
  const [minConcentration, setMinConcentration] = useState('0')
  const [loading, setLoading] = useState(true)
  const [titrationPairs, setTitrationPairs] = useState<TitrationPair[]>([])

  useEffect(() => {
    getTitrationPairs().then((data) => {
      setTitrationPairs(data)
      setLoading(false)
    })
  }, [])

  const handleFilter = () => {
    setLoading(true)
    getTitrationPairs(minConcentration).then((data) => {
      setTitrationPairs(data)
      setLoading(false)
    })
  }

  return (
    <div className="gridScreen">
      <header className="gridHeader">
        <h2>🧪 Labster Grid</h2>
      </header>

      <ConcentrationFilter
        value={minConcentration}
        setValue={(value) => setMinConcentration(value)}
        onSubmit={handleFilter}
        loading={loading}
      />

      <div className="gridScrollArea">
        {loading ? (
          <div className="gridLoader">
            <Spinner animation="border" />
          </div>
        ) : (
          <Row xs={2} className="g-2">
            {titrationPairs.map((item) => (
              <Col key={item.id}>
                <TitrationCard {...item} onClick={() => navigate(`${ROUTES.FEED}/${item.id}`)} />
              </Col>
            ))}
          </Row>
        )}
      </div>
    </div>
  )
}

export default GridPage
