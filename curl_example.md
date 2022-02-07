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

Get User

```shell
curl -X GET \
 -H 'Content-Type: application/json' \
 http://localhost:3000/api/users
```
