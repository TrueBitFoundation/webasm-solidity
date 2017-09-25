FROM ubuntu:17.04
MAINTAINER Harley Swick

ENV PATH="${PATH}:/node-v6.11.3-linux-x64/bin"

RUN apt-get -qq update && \ 
	apt-get install wget git -y

RUN apt-get install -y curl && \
  curl -sL https://deb.nodesource.com/setup_6.x | bash - && \
  apt-get install -y nodejs && \
  npm install -g ethereumjs-testrpc && \
  cd bin && \
  wget https://github.com/ethereum/solidity/releases/download/v0.4.16/solc-static-linux && \
  mv solc-static-linux solc && \
  chmod 744 solc

RUN wget https://dist.ipfs.io/go-ipfs/v0.4.10/go-ipfs_v0.4.10_linux-amd64.tar.gz && \
  tar xf go-ipfs_v0.4.10_linux-amd64.tar.gz && \
  cd go-ipfs && \
  ./install.sh && \
  ipfs init

RUN wget -O getparity.sh https://get.parity.io && \
   apt-get install -y psmisc sudo && \
   bash getparity.sh && \
   (parity --chain dev &) && \
   sleep 10 && \
   killall parity

RUN git clone https://github.com/TrueBitFoundation/webasm-solidity && \
  cd webasm-solidity && \
  npm install && \
  sh compile.sh