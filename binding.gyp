{
  'targets': [{
    'target_name': 'binding',
    'sources': [ 'src/cpp/zlib.cpp' ],
    # Adapted from https://github.com/brianc/node-postgres/blob/master/binding.gyp
    'conditions' : [
      ['OS=="mac"', {
        'include_dirs': ['<!@(pg_config --includedir)'],
        'libraries' : ['-lz -L<!@(pg_config --libdir)']
      }],
      ['OS=="linux"', {
        'include_dirs': ['<!@(pg_config --includedir)'],
        'libraries' : ['-lz -L<!@(pg_config --libdir)']
      }],
      ['OS=="solaris"', {
        'include_dirs': ['<!@(pg_config --includedir)'],
        'libraries' : ['-lz -L<!@(pg_config --libdir)']
      }],
      ['OS=="win"', {
        'include_dirs': ['<!@(pg_config --includedir)'],
        'libraries' : ['libz.lib'],
        'msvs_settings': {
          'VCLinkerTool' : {
            'AdditionalLibraryDirectories' : [
              '<!@(pg_config --libdir)\\'
              ]
          },
        }
      }]
    ]
  }
  ]
}
