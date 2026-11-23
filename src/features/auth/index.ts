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

export { deletionRequested } from './api/deletion'
export { forgetSignedInUser, requireSignedInUser, signedInUserQuery } from './api/session'
export { DeletionCancelledNotice } from './components/DeletionCancelledNotice'
export { UserMenu } from './components/UserMenu'
