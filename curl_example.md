# CURL Examples

## Create User

Single user:

```shell
curl -X POST \
 -H 'Content-Type: application/json' \
 -d '{"commandName":"create_user","payload":{"firstName":"Bernita","lastName":"Jenkins","dateOfBirth":"2022-01-18T22:42:25.165Z","email":"Leanna_Jones49_'${RANDOM}'@gmail.com"}}' \
 http://localhost:3000/api/users
```

Multiple random user

```shell
for i in {1..300}; do curl -X POST \
 -H 'Content-Type: application/json' \
 -d '{"commandName":"create_user","payload":{"firstName":"Bernita","lastName":"Jenkins","dateOfBirth":"2022-01-18T22:42:25.165Z","email":"Leanna_Joness'"${RANDOM}-${i}"'@gmail.com"}}' \
 http://localhost:3000/api/users; done
```

## Get User

```shell
curl -X GET \
 -H 'Content-Type: application/json' \
 http://localhost:3000/api/users
```

## Confirm an email:

Send via rabbit this message on exchange: `events` with routing key: `event.test.email_confirmed`

**Remember to set `id` and `email` to to proper values**

```JSON
{
  "causationId": "92b7f474-1fde-48b0-8f90-e07e5ea2cad5",
  "correlationId": "92b7f474-1fde-48b0-8f90-e07e5ea2cad5",
  "eventName": "email_confirmed",
  "messageId": "e47610cb-c398-42c7-bb25-cc7ffeb42bbf",
  "aggregateVersion": 0,
  "aggregateVersionIndex": 0,
  "payload": {
    "userId": "0c89fd06-d452-4547-8158-ef44214a84a7",
    "email": "Leanna_Jones49_1224@gmail.com"
  }
}
```
