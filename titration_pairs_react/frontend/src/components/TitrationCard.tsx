import './TitrationCard.css'
import type { FC } from 'react'
import { Badge, Card } from 'react-bootstrap'

const defaultImage = '/DefaultImage.jpg'

interface Props {
  title: string
  image_url: string
  ph: number | null
  concentration: number | null
  likes_count: number
  onClick: () => void
}

// Карточка услуги на плитке
export const TitrationCard: FC<Props> = ({ title, image_url, ph, concentration, likes_count, onClick }) => (
  <Card className="gridCard" onClick={onClick}>
    <div className="cardMedia">
      <Card.Img variant="top" src={image_url || defaultImage} alt={title} />
      <Badge bg="dark" className="phTag">
        pH {ph}
      </Badge>
    </div>
    <Card.Body className="gridCardBody">
      <Card.Title className="gridCardTitle">{title}</Card.Title>
      <Card.Text className="concText">{concentration} </Card.Text>
      <span className="likesCount">❤️ {likes_count}</span>
    </Card.Body>
  </Card>
)
