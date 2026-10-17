/** Minimal deterministic ZIP (store method). No compression or external dependency. */
export function makeZip(files){
  const locals=[],central=[];let offset=0;
  for(const {name,content} of files){
    if(name.startsWith('/')||name.split('/').includes('..'))throw new Error('Unsafe ZIP path');
    const filename=Buffer.from(name),body=Buffer.from(content);let crc=0xffffffff;
    for(const b of body){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
    crc=(crc^0xffffffff)>>>0;
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(33,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(body.length,18);local.writeUInt32LE(body.length,22);local.writeUInt16LE(filename.length,26);
    const cd=Buffer.alloc(46);cd.writeUInt32LE(0x02014b50);cd.writeUInt16LE(20,4);cd.writeUInt16LE(20,6);cd.writeUInt16LE(0x800,8);cd.writeUInt16LE(33,14);cd.writeUInt32LE(crc,16);cd.writeUInt32LE(body.length,20);cd.writeUInt32LE(body.length,24);cd.writeUInt16LE(filename.length,28);cd.writeUInt32LE(offset,42);
    locals.push(local,filename,body);central.push(cd,filename);offset+=local.length+filename.length+body.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,directory,end]);
}
