import * as gql from '../../graphql/generated'
import { sha256 } from 'js-sha256'
import { setCacheItem } from '$lib/utils/cacheServices'
import { getGraphqlClient } from '$lib/utils/store'

export type Login = {
  email: string | null
  password: string | null
}

export async function validateAndSignIn(loginData: Login) {
  if (loginData.email == null || loginData.email === '') {
    throw Error('E-mail cannot be empty')
  }

  if (loginData.password == null || loginData.password === '') {
    throw Error('Password cannot be empty')
  }

  const result = await getGraphqlClient()
    .mutation(gql.SigninDocument, { email: loginData.email, password: sha256(loginData.password) })
    .toPromise()

  if (result.data) {
    setCacheItem('loggedUser', { token: result.data.signin.token, email: loginData.email })
  } else if (result.error) {
    throw Error(result.error.message)
  }
}
