import React, { ReactNode } from 'react'
import Head from 'next/head'

type Props = {
  children?: ReactNode
  title?: string
}

const Layout = ({ children, title }: Props) => (
  <div className="bg-light-bg">
    <Head>
      <title>{title}</title>
      <meta charSet="utf-8" />
      <meta name="viewport" content="initial-scale=1.0, width=device-width" />
    </Head>
    <header>
      <nav>
        Nav
      </nav>
    </header>
    {children}
    <footer>
      <hr />
      <span>Footer</span>
    </footer>
  </div>
)

export default Layout