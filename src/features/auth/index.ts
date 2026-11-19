import type { RouteObject } from 'react-router'
import { SignInPage } from './routes/SignInPage'
import { CheckEmailPage } from './routes/CheckEmailPage'
import { ForgotPasswordPage } from './routes/ForgotPasswordPage'
import { RegisterPage } from './routes/RegisterPage'
import { ResetPasswordPage } from './routes/ResetPasswordPage'
import { VerifyEmailPage } from './routes/VerifyEmailPage'

export const authRoutes: RouteObject[] = [
  { path: 'login', Component: SignInPage },
  { path: 'register', Component: RegisterPage },
  { path: 'check-email', Component: CheckEmailPage },
  { path: 'verify-email', Component: VerifyEmailPage },
  { path: 'forgot-password', Component: ForgotPasswordPage },
  { path: 'reset-password', Component: ResetPasswordPage },
]

export { requireSignedInUser, signedInUserQuery } from './api/session'
export { UserMenu } from './components/UserMenu'
