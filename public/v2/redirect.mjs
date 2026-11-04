const target=new URL('/v2/',window.location.origin);target.search=window.location.search;target.hash=window.location.hash;window.location.replace(target.href);
