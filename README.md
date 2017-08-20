# npm-share

If you have several Node codebases installed on a server, there may well be duplication between them, as they have shared dependencies. And if the same Node.JS instance reads them, there may be memory duplicaiton. `npm-share` is a script that allows modules to be shared.

More to come!!

m1
 +-- m2
 +-- m3

becomes

m1
 +-- m2 [SYMLINK]
 +-- m3 [SYMLINK]

shared_modules
 +-- m2@...
 +-- m3@...

more complicated example

 m1
  +-- m2
      +-- m3
  +-- m4
      +-- m3
      +-- m5

becomes

m1
 +-- m2 [SYMLINK]
 +-- m4 [SYMLINK]

shared_modules
 +-- m2@...
      +-- m3 [SYMLINK]
 +-- m3@...
 +-- m4@...
      +-- m3 [SYMLINK]
      +-- m5 [SYMLINK]
 +-- m5@...
