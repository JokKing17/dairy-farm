import "./globals.css";
import "./auth.css";
import "./vendor.css";
import "./procurement.css";
import "./dashboard.css";
import "./layout-fix.css";
import "./deliveries.css";
import "./statements.css";
export const metadata={title:"DairyFlow · Business Management",description:"Private dairy operations and accounting",manifest:"/manifest.webmanifest"};
export const viewport={themeColor:"#176b52"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
