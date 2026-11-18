import type { RouteObject } from 'react-router'
import { SignInPage } from './routes/SignInPage'
import { RegisterPage } from './routes/RegisterPage'
import { ResetPasswordPage } from './routes/ResetPasswordPage'

export const authRoutes: RouteObject[] = [
  { path: 'login', Component: SignInPage },
  { path: 'register', Component: RegisterPage },
  { path: 'reset', Component: ResetPasswordPage },
]
