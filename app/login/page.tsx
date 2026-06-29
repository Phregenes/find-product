import { Suspense } from 'react'
import AuthForm from '@/app/components/AuthForm'

export default function LoginPage() {
  return (
    <Suspense>
      <AuthForm mode="login" />
    </Suspense>
  )
}
