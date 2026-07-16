import "./globals.css";
export const metadata={title:"DairyFlow · Business Management",description:"Private dairy operations and accounting",manifest:"/manifest.webmanifest"};
export const viewport={themeColor:"#176b52"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
