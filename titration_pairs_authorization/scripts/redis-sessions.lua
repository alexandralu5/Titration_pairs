-- Показывает содержимое Redis для сессий: ключ, пользователя сессии
-- и сколько секунд сессии осталось жить.
--
-- Запуск из папки проекта:
--   docker exec -i redis redis-cli --raw EVAL "$(cat scripts/redis-sessions.lua)" 0
--
-- Скрипт выполняется внутри Redis целиком: KEYS, GET и TTL читают данные
-- в один момент, поэтому сессия не может истечь между командами.

local keys = redis.call('KEYS', 'session:*')
local lines = { 'Активных сессий: ' .. #keys }

for i, key in ipairs(keys) do
  local user = cjson.decode(redis.call('GET', key))
  local ttl = redis.call('TTL', key)
  table.insert(lines, '')
  table.insert(lines, i .. ') ' .. key)
  table.insert(lines, '   пользователь: ' .. user.username .. ' (id ' .. user.id .. ', роль ' .. user.role .. ')')
  table.insert(lines, '   осталось: ' .. ttl .. ' с')
end

return lines
