// Optional cutover to the current Node/Vercel game. Unset means existing routing is unchanged.
export async function proxyMurderMystery(request, env, upstreamFetch=fetch) {
  const url=new URL(request.url);
  if(!(url.pathname==='/murder-mystery'||url.pathname.startsWith('/murder-mystery/'))||!env.MURDER_MYSTERY_ORIGIN)return null;
  let origin;
  try{origin=new URL(env.MURDER_MYSTERY_ORIGIN);}catch{return new Response('Murder mystery origin is not configured correctly.',{status:503});}
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash||origin.host===url.host)return new Response('Murder mystery origin is not configured correctly.',{status:503});
  const target=new URL(url.pathname+url.search,origin);
  const headers=new Headers(request.headers);headers.delete('host');headers.set('X-Forwarded-Host',url.host);headers.set('X-Forwarded-Proto','https');
  try{
    const result=await upstreamFetch(new Request(target,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,redirect:'manual',...(['GET','HEAD'].includes(request.method)?{}:{duplex:'half'})}));
    const responseHeaders=new Headers(result.headers);
    responseHeaders.set('Cache-Control','private, no-store');
    const location=responseHeaders.get('Location');
    if(location){const redirect=new URL(location,target);if(redirect.origin===origin.origin){redirect.protocol=url.protocol;redirect.host=url.host;responseHeaders.set('Location',redirect.toString());}}
    return new Response(result.body,{status:result.status,statusText:result.statusText,headers:responseHeaders});
  }catch{return new Response('The investigation is temporarily unavailable. Please try again.',{status:502,headers:{'Cache-Control':'no-store'}});}
}
